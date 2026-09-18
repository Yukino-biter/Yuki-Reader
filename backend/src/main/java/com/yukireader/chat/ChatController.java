package com.yukireader.chat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/chat")
    public Map<String, Object> chat(@RequestBody ChatRequest request) {
        String content = chatService.complete(request);
        return Map.of("content", content);
    }

    /** 流式翻译：原样中继上游 SSE；后端不理解 SSE 语义，纯转发（规格 §5）。 */
    @PostMapping("/chat/stream")
    public ResponseEntity<StreamingResponseBody> chatStream(@RequestBody ChatRequest request) {
        HttpResponse<InputStream> upstream = chatService.openStream(request);
        StreamingResponseBody body = (out) -> relay(upstream.body(), out);
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(body);
    }

    private void relay(InputStream in, OutputStream out) throws java.io.IOException {
        long lines = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lines++;
                out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (org.apache.catalina.connector.ClientAbortException e) {
            // 前端中止（停止按钮/新操作取消旧流/页面离开）：属预期，不打堆栈
            log.info("stream relay: 客户端中止，已中继 {} 行", lines);
        }
    }
}
