package com.yukireader;

import com.yukireader.dict.JmdictRepository;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
public class YukiReaderApplication {

    public static void main(String[] args) {
        ConfigurableApplicationContext ctx = SpringApplication.run(YukiReaderApplication.class, args);

        boolean importOnly = ctx.getEnvironment().getProperty("yuki.jmdict.import-only", Boolean.class, false);
        if (importOnly) {
            JmdictRepository repo = ctx.getBean(JmdictRepository.class);
            long count = repo.countEntries();
            System.out.println(count > 0
                    ? "JMDict import complete: " + count + " rows."
                    : "JMDict import failed: no rows imported (check yuki.jmdict.xml).");
            System.exit(SpringApplication.exit(ctx, () -> count > 0 ? 0 : 1));
        }
    }
}
