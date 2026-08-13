package com.yukireader.tokenize;

import com.yukireader.chat.ChatServiceException;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TokenizeController {

    static final int MAX_SENTENCES = 50;
    static final int MAX_SENTENCE_LENGTH = 2000;

    private final TokenizerService tokenizerService;

    public TokenizeController(TokenizerService tokenizerService) {
        this.tokenizerService = tokenizerService;
    }

    @PostMapping("/tokenize")
    public Map<String, Object> tokenize(@RequestBody TokenRequest request) {
        validate(request);
        return Map.of("rows", tokenizerService.tokenize(request.sentences()));
    }

    private void validate(TokenRequest request) {
        if (request.sentences() == null || request.sentences().isEmpty()) {
            throw badRequest("sentences 不能为空，数量必须在 1–50 之间");
        }
        if (request.sentences().size() > MAX_SENTENCES) {
            throw badRequest("sentences 数量不能超过 50");
        }
        for (String sentence : request.sentences()) {
            if (sentence == null) {
                throw badRequest("sentences 中不能包含空项");
            }
            if (sentence.length() > MAX_SENTENCE_LENGTH) {
                throw badRequest("单句长度不能超过 2000 字符");
            }
        }
    }

    private ChatServiceException badRequest(String message) {
        return new ChatServiceException("bad_request", message);
    }
}
