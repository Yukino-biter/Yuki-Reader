package com.yukireader.tokenize;

import com.atilika.kuromoji.ipadic.Token;
import com.atilika.kuromoji.ipadic.Tokenizer;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Backend morphological analysis with kuromoji-java (IPADIC).
 *
 * <p>The Atilika {@link Tokenizer} is thread-safe after construction, so a single
 * instance is shared by all requests (never build one per request — the dictionary
 * load is expensive). Startup warm-up happens in {@link TokenizerInitRunner}.
 */
@Service
public class TokenizerService {

    /**
     * Same punctuation/whitespace rule as the old frontend PUNCT_RE:
     * a token whose surface is only punctuation/whitespace is not clickable.
     */
    private static final Pattern PUNCT_RE =
            Pattern.compile("^[\\p{IsWhite_Space}\\uFEFF、，。．！？…「」『』（）()・—―ー~〜]+$");

    private final Tokenizer tokenizer = new Tokenizer();

    /** Tokenize each sentence; the returned list is one-to-one with the input. */
    public List<List<TokenRow>> tokenize(List<String> sentences) {
        return sentences.stream().map(this::tokenizeOne).toList();
    }

    private List<TokenRow> tokenizeOne(String sentence) {
        return tokenizer.tokenize(sentence).stream().map(this::toRow).toList();
    }

    private TokenRow toRow(Token token) {
        String surface = token.getSurface();
        String reading = token.getReading();
        String basic = token.getBaseForm();
        String pos = joinPos(token.getPartOfSpeechLevel1(), token.getPartOfSpeechLevel2(), token.getPartOfSpeechLevel3());
        boolean clickable = !(pos.startsWith("記号") || PUNCT_RE.matcher(surface).matches());
        return new TokenRow(
                surface,
                emptyTo(reading, surface),
                emptyTo(basic, surface),
                pos,
                clickable);
    }

    private static String emptyTo(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static String joinPos(String... levels) {
        StringBuilder sb = new StringBuilder();
        for (String level : levels) {
            if (level != null && !level.isEmpty()) {
                if (sb.length() > 0) {
                    sb.append('・');
                }
                sb.append(level);
            }
        }
        return sb.toString();
    }
}
