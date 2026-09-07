package com.yukireader.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ChatServiceTest {

    private HttpClient client;
    private HttpResponse<String> response;
    private ChatService service;

    @BeforeEach
    void setUp() {
        client = mock(HttpClient.class);
        response = mock(HttpResponse.class);
        service = new ChatService(client, 30);
    }

    private ChatRequest request() {
        return new ChatRequest(
                "https://api.deepseek.com",
                "deepseek-chat",
                "sk-test",
                List.of(new ChatMessage("user", "こんにちは")));
    }

    @Test
    void successReturnsContentAndForwardsKeyAsBearer() throws Exception {
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"choices\":[{\"message\":{\"content\":\"你好\"}}]}");
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        String result = service.complete(request());

        assertThat(result).isEqualTo("你好");
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(captor.capture(), any());
        assertThat(captor.getValue().headers().firstValue("Authorization")).hasValue("Bearer sk-test");
        assertThat(captor.getValue().uri().toString()).isEqualTo("https://api.deepseek.com/chat/completions");
    }

    @Test
    void invalidKeyMapsTo401Code() throws Exception {
        when(response.statusCode()).thenReturn(401);
        when(response.body()).thenReturn("{\"error\":{\"message\":\"Invalid API key\"}}");
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("invalid_key");
                    assertThat(e.getMessage()).contains("API Key 无效");
                });
    }

    @Test
    void rateLimitMapsTo429Code() throws Exception {
        when(response.statusCode()).thenReturn(429);
        when(response.body()).thenReturn("{}");
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("rate_limited");
                    assertThat(e.getMessage()).contains("额度不足");
                });
    }

    @Test
    void badRequestKeepsUpstreamMessage() throws Exception {
        when(response.statusCode()).thenReturn(400);
        when(response.body()).thenReturn("{\"error\":{\"message\":\"model not found\"}}");
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("bad_request");
                    assertThat(e.getMessage()).isEqualTo("model not found");
                });
    }

    @Test
    void upstream5xxMapsToUpstreamError() throws Exception {
        when(response.statusCode()).thenReturn(502);
        when(response.body()).thenReturn("bad gateway");
        doReturn(response).when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("upstream_error");
                });
    }

    @Test
    void timeoutMapsToTimeoutCode() throws Exception {
        doThrow(new HttpTimeoutException("timed out"))
                .when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("timeout");
                });
    }

    @Test
    void ioErrorMapsToNetworkCode() throws Exception {
        doThrow(new IOException("connection refused"))
                .when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.complete(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("network");
                });
    }

    @Test
    void missingApiKeyIsRejectedWithoutCallingUpstream() throws Exception {
        ChatRequest bad = new ChatRequest(
                "https://api.deepseek.com",
                "deepseek-chat",
                "  ",
                List.of(new ChatMessage("user", "hi")));

        assertThatThrownBy(() -> service.complete(bad))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("bad_request");
                    assertThat(e.getMessage()).contains("缺少必填字段");
                });
        verify(client, org.mockito.Mockito.never()).send(any(), any());
    }

    @Test
    void nonHttpBaseUrlIsRejected() {
        ChatRequest bad = new ChatRequest(
                "ftp://example.com",
                "m",
                "sk-x",
                List.of(new ChatMessage("user", "hi")));

        assertThatThrownBy(() -> service.complete(bad))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("bad_request");
                    assertThat(e.getMessage()).contains("http");
                });
    }

    @Test
    void emptyMessagesAreRejected() {
        ChatRequest bad = new ChatRequest("https://api.deepseek.com", "m", "sk-x", List.of());
        assertThatThrownBy(() -> service.complete(bad))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("bad_request");
                    assertThat(e.getMessage()).contains("messages");
                });
    }

    @Test
    void buildUrlAppendsChatCompletionsOnce() {
        assertThat(ChatService.buildUrl("https://api.deepseek.com/")).isEqualTo("https://api.deepseek.com/chat/completions");
        assertThat(ChatService.buildUrl("https://api.openai.com/v1")).isEqualTo("https://api.openai.com/v1/chat/completions");
        assertThat(ChatService.buildUrl("https://example.com/chat/completions")).isEqualTo("https://example.com/chat/completions");
    }

    @Test
    void openStreamReturnsUpstreamBodyOnSuccess() throws Exception {
        HttpResponse<InputStream> streamResponse = mock(HttpResponse.class);
        when(streamResponse.statusCode()).thenReturn(200);
        when(streamResponse.body()).thenReturn(new ByteArrayInputStream(
                "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8)));
        doReturn(streamResponse).when(client).send(any(HttpRequest.class), any());

        HttpResponse<InputStream> upstream = service.openStream(request());

        assertThat(upstream.statusCode()).isEqualTo(200);
        String body = new String(upstream.body().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(body).contains("\"delta\"");
        assertThat(body).contains("[DONE]");
    }

    @Test
    void openStreamMapsUpstreamErrors() throws Exception {
        HttpResponse<InputStream> streamResponse = mock(HttpResponse.class);
        when(streamResponse.statusCode()).thenReturn(401);
        when(streamResponse.body()).thenReturn(new ByteArrayInputStream(
                "{\"error\":{\"message\":\"Invalid API key\"}}".getBytes(StandardCharsets.UTF_8)));
        doReturn(streamResponse).when(client).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.openStream(request()))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("invalid_key");
                    assertThat(e.getMessage()).contains("API Key 无效");
                });
    }

    @Test
    void openStreamRejectsInvalidInputWithoutCallingUpstream() throws Exception {
        ChatRequest bad = new ChatRequest(
                "https://api.deepseek.com",
                "deepseek-chat",
                "  ",
                List.of(new ChatMessage("user", "hi")));

        assertThatThrownBy(() -> service.openStream(bad))
                .isInstanceOfSatisfying(ChatServiceException.class, e -> {
                    assertThat(e.code()).isEqualTo("bad_request");
                });
        verify(client, org.mockito.Mockito.never()).send(any(), any());
    }
}
