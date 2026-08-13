package com.yukireader.dict;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class JmdictRepository {

    /** Separator used inside the glosses TEXT column (never appears in JMDict glosses). */
    static final String GLOSS_SEPARATOR = "\u001F";

    private final JdbcTemplate jdbc;
    private final RowMapper<DictEntry> mapper = (ResultSet rs, int rowNum) -> new DictEntry(
            rs.getString("surface"),
            rs.getString("reading"),
            rs.getString("pos"),
            splitGlosses(rs.getString("glosses")),
            splitGlosses(rs.getString("glosses_zh")));

    public JmdictRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        initSchema();
    }

    private void initSchema() {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS dict_entries (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  seq INTEGER,
                  surface TEXT NOT NULL,
                  reading TEXT NOT NULL DEFAULT '',
                  pos TEXT NOT NULL DEFAULT '',
                  glosses TEXT NOT NULL DEFAULT '',
                  glosses_zh TEXT NOT NULL DEFAULT ''
                )
                """);
        ensureGlossesZhColumn();
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS jmdict_meta (
                  key TEXT PRIMARY KEY,
                  value TEXT
                )
                """);
        jdbc.execute("PRAGMA journal_mode=WAL");
        jdbc.execute("PRAGMA synchronous=NORMAL");
    }

    /** Migration for databases created before the Chinese-gloss column existed. */
    private void ensureGlossesZhColumn() {
        List<String> cols = jdbc.query("PRAGMA table_info(dict_entries)",
                (ResultSet rs, int rowNum) -> rs.getString("name"));
        if (!cols.contains("glosses_zh")) {
            jdbc.execute("ALTER TABLE dict_entries ADD COLUMN glosses_zh TEXT NOT NULL DEFAULT ''");
        }
    }

    private static List<String> splitGlosses(String value) {
        if (value == null || value.isEmpty()) return List.of();
        return Arrays.stream(value.split(GLOSS_SEPARATOR, -1))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    public long countEntries() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM dict_entries", Long.class);
        return n == null ? 0 : n;
    }

    public List<DictEntry> findByWord(String word) {
        return jdbc.query("""
                SELECT surface, reading, pos, glosses, glosses_zh FROM dict_entries
                WHERE surface = ? OR reading = ?
                ORDER BY CASE WHEN surface = ? THEN 0 WHEN reading = ? THEN 1 ELSE 2 END, id
                LIMIT 60
                """, mapper, word, word, word, word);
    }

    public void deleteAll() {
        jdbc.update("DELETE FROM dict_entries");
    }

    public void createIndexes() {
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dict_surface ON dict_entries(surface)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_dict_reading ON dict_entries(reading)");
    }

    public void batchInsert(List<Object[]> rows) {
        jdbc.batchUpdate("""
                INSERT INTO dict_entries (seq, surface, reading, pos, glosses)
                VALUES (?, ?, ?, ?, ?)
                """, rows);
    }

    public void setMeta(String key, String value) {
        jdbc.update("INSERT INTO jmdict_meta (key, value) VALUES (?, ?) "
                + "ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
    }

    public String getMeta(String key) {
        List<String> values = jdbc.queryForList("SELECT value FROM jmdict_meta WHERE key = ?", String.class, key);
        return values.isEmpty() ? null : values.get(0);
    }
}
