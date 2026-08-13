package com.yukireader.tokenize;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class TokenizeControllerTest {

    static final Path DB_PATH;

    static {
        try {
            DB_PATH = Files.createTempFile("yuki-tokenize-it-", ".db");
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

    @Test
    void tokenizesSentencesAndReturnsRowsOneToOne() throws Exception {
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sentences":["私は学生である。","呼んでください。"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0][0].surface").value("私"))
                .andExpect(jsonPath("$.rows[0][0].reading").value("ワタシ"))
                .andExpect(jsonPath("$.rows[0][0].basic").value("私"))
                .andExpect(jsonPath("$.rows[0][0].clickable").value(true))
                .andExpect(jsonPath("$.rows[0][5].surface").value("。"))
                .andExpect(jsonPath("$.rows[0][5].clickable").value(false))
                .andExpect(jsonPath("$.rows[1][0].surface").value("呼ん"))
                .andExpect(jsonPath("$.rows[1][0].basic").value("呼ぶ"))
                .andExpect(jsonPath("$.rows[1][0].reading").value("ヨン"));
    }

    @Test
    void emptySentencesReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"sentences":[]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("bad_request"));
    }

    @Test
    void missingSentencesReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("bad_request"));
    }

    @Test
    void tooManySentencesReturnsBadRequest() throws Exception {
        String sentences = IntStream.range(0, 51)
                .mapToObj(i -> "\"文\"")
                .collect(Collectors.joining(",", "[", "]"));
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sentences\":" + sentences + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("bad_request"));
    }

    @Test
    void overlongSentenceReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sentences\":[\"" + "あ".repeat(2001) + "\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("bad_request"));
    }

    @Test
    void malformedJsonReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/tokenize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest());
    }
}
