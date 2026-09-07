package com.yukireader.chat;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class ChatControllerTest {

    static final Path DB_PATH;

    static {
        try {
            DB_PATH = Files.createTempFile("yuki-chat-it-", ".db");
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("yuki.db.path", () -> DB_PATH.toString());
        registry.add("yuki.jmdict.auto-import", () -> "false");
    }

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    ChatService chatService;

    private static final String BODY =
            """
            {"baseUrl":"https://api.deepseek.com","model":"deepseek-chat","apiKey":"sk-x",
             "messages":[{"role":"user","content":"こんにちは"}]}
            """;


    @Test
    void chatReturnsTranslatedContent() throws Exception {
        when(chatService.complete(any())).thenReturn("你好");

        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("你好"));
    }

    @Test
    void invalidKeyMapsTo401() throws Exception {
        when(chatService.complete(any()))
                .thenThrow(new ChatServiceException("invalid_key", "API Key 无效，请检查设置"));

        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("invalid_key"));
    }

    @Test
    void rateLimitedMapsTo429() throws Exception {
        when(chatService.complete(any()))
                .thenThrow(new ChatServiceException("rate_limited", "额度不足或限流，请稍后重试"));

        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error.code").value("rate_limited"));
    }

    @Test
    void timeoutMapsTo504() throws Exception {
        when(chatService.complete(any()))
                .thenThrow(new ChatServiceException("timeout", "请求上游超时，请稍后重试"));

        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.error.code").value("timeout"));
    }

    @Test
    void malformedJsonReturns400() throws Exception {
        mockMvc.perform(post("/api/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void streamRequestRelaysSseBody() throws Exception {
        HttpResponse<InputStream> upstream = mock(HttpResponse.class);
        when(upstream.statusCode()).thenReturn(200);
        when(upstream.body()).thenReturn(new ByteArrayInputStream(
                "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8)));
        when(chatService.openStream(any())).thenReturn(upstream);

        MvcResult mvc = mockMvc.perform(post("/api/chat/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(mvc))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andExpect(content().string(containsString("data: {\"choices\"")));
    }
}
