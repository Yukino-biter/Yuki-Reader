package com.yukireader.dict;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class DictControllerTest {

    static final Path DB_PATH;

    static {
        try {
            DB_PATH = Files.createTempFile("yuki-dict-it-", ".db");
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

    @Autowired
    JmdictRepository repository;

    @BeforeEach
    void seed() {
        repository.deleteAll();
        repository.batchInsert(List.of(
                new Object[]{"1000010", "私", "わたし", "名詞",
                        "I; myself" + JmdictRepository.GLOSS_SEPARATOR + "private affairs"},
                new Object[]{"1000020", "呼ぶ", "よぶ", "動詞", "to call; to invite"},
                new Object[]{"1000030", "学生", "がくせい", "名詞", "student"}));
    }

    @Test
    void wordHitReturnsEntries() throws Exception {
        mockMvc.perform(get("/api/dict").param("word", "私"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].surface").value("私"))
                .andExpect(jsonPath("$[0].reading").value("わたし"))
                .andExpect(jsonPath("$[0].pos").value("名詞"))
                .andExpect(jsonPath("$[0].glosses[0]").value("I; myself"));
    }

    @Test
    void readingFormAlsoHits() throws Exception {
        mockMvc.perform(get("/api/dict").param("word", "よぶ"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].surface").value("呼ぶ"));
    }

    @Test
    void missReturnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/dict").param("word", "存在しない言葉"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void blankWordReturnsEmptyList() throws Exception {
        mockMvc.perform(get("/api/dict").param("word", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }
}
