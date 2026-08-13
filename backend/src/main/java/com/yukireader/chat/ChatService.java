package com.yukireader.chat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Thin proxy to any OpenAI-compatible /chat/completions endpoint (spec §4).
 * The API key is forwarded in the Authorization header only; it is never
 * persisted and never logged. Request/response bodies are not logged either.
 */
@Service
public class ChatService {

    private static final Set<String> ALLOWED_ROLES = Set.of("system", "user", "assistant");
    private static final int MAX_MESSAGES = 50;
    private static final int MAX_CONTENT_LENGTH = 20000;
    private static final int MAX_API_KEY_LENGTH = 512;

    private final HttpClient client;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Duration timeout;

    @Autowired
    public ChatService(@Value("${yuki.chat.timeout-seconds:60}") int timeoutSeconds) {
        this(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(timeoutSeconds))
                .build(), timeoutSeconds);
    }

    ChatService(HttpClient client, int timeoutSeconds) {
        this.client = client;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    public String complete(ChatRequest request) {
        validate(request);
        String url = buildUrl(request.baseUrl());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model().trim());
        body.put("messages", request.messages());

        String json;
        try {
            json = mapper.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new ChatServiceException("bad_request", "请求体序列化失败");
        }

        HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + request.apiKey().trim())
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response;
        try {
            response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (HttpTimeoutException e) {
            throw new ChatServiceException("timeout", "请求上游超时，请稍后重试");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ChatServiceException("network", "请求被中断，请重试");
        } catch (IOException e) {
            throw new ChatServiceException("network", "无法连接上游服务，请检查 Base URL 或网络");
        }

        String responseBody = response.body();
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            try {
                JsonNode node = mapper.readTree(responseBody);
                String content = node.path("choices").path(0).path("message").path("content").asText(null);
                if (content == null) {
                    throw new ChatServiceException("bad_response", "上游返回格式异常");
                }
                return content;
            } catch (JsonProcessingException e) {
                throw new ChatServiceException("bad_response", "上游返回格式异常");
            }
        }

        String upstreamMessage = extractUpstreamError(responseBody);
        throw switch (response.statusCode()) {
            case 401, 403 -> new ChatServiceException("invalid_key", "API Key 无效，请检查设置");
            case 429 -> new ChatServiceException("rate_limited", "额度不足或限流，请稍后重试");
            case 400, 422 -> new ChatServiceException("bad_request", upstreamMessage);
            default -> new ChatServiceException("upstream_error", upstreamMessage);
        };
    }

    private void validate(ChatRequest request) {
        if (request == null
                || request.baseUrl() == null || request.baseUrl().trim().isEmpty()
                || request.model() == null || request.model().trim().isEmpty()
                || request.apiKey() == null || request.apiKey().trim().isEmpty()) {
            throw new ChatServiceException("bad_request", "缺少必填字段：baseUrl / model / apiKey");
        }
        if (request.apiKey().length() > MAX_API_KEY_LENGTH) {
            throw new ChatServiceException("bad_request", "apiKey 长度超出限制");
        }
        String base = request.baseUrl().trim();
        if (!(base.startsWith("http://") || base.startsWith("https://"))) {
            throw new ChatServiceException("bad_request", "baseUrl 必须是 http(s) 地址");
        }
        List<ChatMessage> messages = request.messages();
        if (messages == null || messages.isEmpty()) {
            throw new ChatServiceException("bad_request", "messages 不能为空");
        }
        if (messages.size() > MAX_MESSAGES) {
            throw new ChatServiceException("bad_request", "messages 数量超出限制");
        }
        for (ChatMessage m : messages) {
            if (m == null || !ALLOWED_ROLES.contains(m.role())
                    || m.content() == null || m.content().trim().isEmpty()) {
                throw new ChatServiceException("bad_request", "messages 包含非法消息");
            }
            if (m.content().length() > MAX_CONTENT_LENGTH) {
                throw new ChatServiceException("bad_request", "单条消息内容过长");
            }
        }
    }

    static String buildUrl(String baseUrl) {
        String base = baseUrl.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base.endsWith("/chat/completions") ? base : base + "/chat/completions";
    }

    private String extractUpstreamError(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return "上游服务返回错误，请稍后重试";
        }
        try {
            JsonNode node = mapper.readTree(responseBody);
            String message = node.path("error").path("message").asText(null);
            if (message != null && !message.isBlank()) {
                return message.length() > 500 ? message.substring(0, 500) : message;
            }
        } catch (JsonProcessingException e) {
            // non-JSON upstream error body: fall through
        }
        return "上游服务返回错误，请稍后重试";
    }
}
