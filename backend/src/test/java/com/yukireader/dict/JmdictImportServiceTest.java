package com.yukireader.dict;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JmdictImportServiceTest {

    private Path dbFile;
    private Path xmlFile;
    private JmdictRepository repository;
    private JmdictImportService importService;

    @BeforeEach
    void setUp() throws Exception {
        dbFile = Files.createTempFile("yuki-import-", ".db");
        Files.deleteIfExists(dbFile);
        DataSource ds = new DriverManagerDataSource("jdbc:sqlite:" + dbFile);
        repository = new JmdictRepository(new JdbcTemplate(ds));
        importService = new JmdictImportService(repository);

        xmlFile = Files.createTempFile("JMdict-sample", ".xml");
        Files.writeString(xmlFile, """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE JMdict [
                  <!ENTITY n "noun">
                  <!ENTITY v5k "Godan verb">
                ]>
                <JMdict>
                  <entry>
                    <ent_seq>1000010</ent_seq>
                    <k_ele><keb>私</keb></k_ele>
                    <r_ele><reb>わたし</reb></r_ele>
                    <sense>
                      <pos>&n;</pos>
                      <gloss>I; myself</gloss>
                      <gloss>private affairs</gloss>
                    </sense>
                    <sense>
                      <pos>&n;</pos>
                      <gloss>self</gloss>
                    </sense>
                  </entry>
                  <entry>
                    <ent_seq>1000020</ent_seq>
                    <r_ele><reb>あるく</reb></r_ele>
                    <sense>
                      <pos>&v5k;</pos>
                      <gloss>to walk</gloss>
                    </sense>
                  </entry>
                </JMdict>
                """, StandardCharsets.UTF_8);
    }

    @AfterEach
    void tearDown() throws Exception {
        Files.deleteIfExists(dbFile);
        Files.deleteIfExists(xmlFile);
    }

    @Test
    void importsEntriesSensesAndReadings() throws Exception {
        long rows = importService.importFromXml(xmlFile);

        assertThat(rows).isEqualTo(3);
        List<DictEntry> hits = repository.findByWord("私");
        assertThat(hits).hasSize(2);
        assertThat(hits.get(0).glosses()).containsExactly("I; myself", "private affairs");
        assertThat(hits.get(1).glosses()).containsExactly("self");
        assertThat(repository.findByWord("あるく")).hasSize(1);
        assertThat(repository.findByWord("わたし")).hasSize(2);
        assertThat(repository.getMeta("license")).contains("CC BY-SA");
    }

    @Test
    void importIsIdempotentAcrossFreshDatabases() throws Exception {
        importService.importFromXml(xmlFile);
        assertThat(repository.countEntries()).isEqualTo(3);
    }
}
