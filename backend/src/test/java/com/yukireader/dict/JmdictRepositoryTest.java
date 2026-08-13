package com.yukireader.dict;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JmdictRepositoryTest {

    private Path dbFile;
    private JmdictRepository repository;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("yuki-repo-", ".db");
        Files.deleteIfExists(dbFile);
        DataSource ds = new DriverManagerDataSource("jdbc:sqlite:" + dbFile);
        repository = new JmdictRepository(new JdbcTemplate(ds));
    }

    @AfterEach
    void tearDown() throws Exception {
        Files.deleteIfExists(dbFile);
    }

    @Test
    void findByWordMatchesSurfaceForm() {
        repository.batchInsert(List.<Object[]>of(new Object[]{
                "1000010", "私", "わたし", "名詞",
                "I; myself" + JmdictRepository.GLOSS_SEPARATOR + "private affairs"
        }));

        List<DictEntry> hits = repository.findByWord("私");

        assertThat(hits).hasSize(1);
        DictEntry entry = hits.get(0);
        assertThat(entry.surface()).isEqualTo("私");
        assertThat(entry.reading()).isEqualTo("わたし");
        assertThat(entry.pos()).isEqualTo("名詞");
        assertThat(entry.glosses()).containsExactly("I; myself", "private affairs");
    }

    @Test
    void findByWordMatchesReadingForm() {
        repository.batchInsert(List.<Object[]>of(new Object[]{
                "1000010", "私", "わたし", "名詞", "I; myself"
        }));

        List<DictEntry> hits = repository.findByWord("わたし");

        assertThat(hits).hasSize(1);
        assertThat(hits.get(0).surface()).isEqualTo("私");
    }

    @Test
    void missReturnsEmptyList() {
        repository.batchInsert(List.<Object[]>of(new Object[]{"1", "私", "わたし", "名詞", "I"}));
        assertThat(repository.findByWord("存在しない言葉")).isEmpty();
    }

    @Test
    void countEntriesReflectsInserts() {
        assertThat(repository.countEntries()).isZero();
        repository.batchInsert(List.of(
                new Object[]{"1", "私", "わたし", "名詞", "I"},
                new Object[]{"2", "あなた", "あなた", "代名詞", "you"}));
        assertThat(repository.countEntries()).isEqualTo(2);
    }
}
