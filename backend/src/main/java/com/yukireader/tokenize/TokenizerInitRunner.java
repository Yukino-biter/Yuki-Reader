package com.yukireader.tokenize;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Warm up the shared kuromoji tokenizer once at startup so the first request is fast. */
@Component
public class TokenizerInitRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TokenizerInitRunner.class);

    private final TokenizerService tokenizerService;

    public TokenizerInitRunner(TokenizerService tokenizerService) {
        this.tokenizerService = tokenizerService;
    }

    @Override
    public void run(ApplicationArguments args) {
        long start = System.currentTimeMillis();
        tokenizerService.tokenize(List.of("テスト"));
        log.info("kuromoji 分词器预热完成（{} ms）。", System.currentTimeMillis() - start);
    }
}
