package com.yukireader.chat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
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
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                out.write((line + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        }
    }
}
