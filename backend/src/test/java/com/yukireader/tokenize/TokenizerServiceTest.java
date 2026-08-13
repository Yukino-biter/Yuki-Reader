package com.yukireader.tokenize;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** Unit tests against the real IPADIC dictionary bundled with kuromoji-ipadic. */
class TokenizerServiceTest {

    private final TokenizerService service = new TokenizerService();

    @Test
    void conjugationResolvesToDictionaryFormAndReading() {
        List<TokenRow> rows = service.tokenize(List.of("呼んでください。")).get(0);
        TokenRow yon = rows.stream()
                .filter(row -> "呼ぶ".equals(row.basic()))
                .findFirst()
                .orElseThrow();
        assertEquals("ヨン", yon.reading());
        assertTrue(yon.clickable());
    }

    @Test
    void kanjiWordCarriesKatakanaReading() {
        TokenRow row = service.tokenize(List.of("私")).get(0).get(0);
        assertEquals("私", row.surface());
        assertEquals("ワタシ", row.reading());
        assertEquals("私", row.basic());
        assertEquals("名詞・代名詞・一般", row.pos());
        assertTrue(row.clickable());
    }

    @Test
    void punctuationAndWhitespaceAreNotClickable() {
        List<TokenRow> rows = service.tokenize(List.of("私は学生である。", "　")).get(1);
        assertFalse(rows.isEmpty());
        for (TokenRow row : rows) {
            assertFalse(row.clickable(), "punctuation/whitespace token must not be clickable: " + row);
        }

        TokenRow period = service.tokenize(List.of("私は学生である。")).get(0).stream()
                .filter(row -> "。".equals(row.surface()))
                .findFirst()
                .orElseThrow();
        assertFalse(period.clickable());
        assertTrue(period.pos().startsWith("記号"));
    }

    @Test
    void rowsCorrespondOneToOneWithInput() {
        List<List<TokenRow>> rows = service.tokenize(List.of("私", "学生", "ある"));
        assertEquals(3, rows.size());
        assertEquals("私", rows.get(0).get(0).surface());
        assertEquals("学生", rows.get(1).get(0).surface());
        assertEquals("ある", rows.get(2).get(0).surface());
    }
}
