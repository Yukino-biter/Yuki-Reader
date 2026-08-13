package com.yukireader.dict;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * One-time initialisation on first startup: imports JMDict into SQLite and
 * verifies the built-in book asset (spec §13). If the JMDict XML is missing the
 * app still starts; the dictionary returns empty results until it is imported.
 */
@Component
public class JmdictInitRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(JmdictInitRunner.class);

    private final JmdictRepository repository;
    private final JmdictImportService importService;
    private final Environment environment;

    public JmdictInitRunner(JmdictRepository repository, JmdictImportService importService, Environment environment) {
        this.repository = repository;
        this.importService = importService;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        long existing = repository.countEntries();
        if (existing > 0) {
            log.info("JMDict 已导入（{} 行），跳过初始化。", existing);
        } else if (!environment.getProperty("yuki.jmdict.auto-import", Boolean.class, true)) {
            log.info("JMDict 自动导入已关闭（yuki.jmdict.auto-import=false），跳过。");
        } else {
            Path xml = Path.of(environment.getProperty("yuki.jmdict.xml", "./data/jmdict/JMdict_e"));
            if (!Files.isRegularFile(xml)) {
                log.warn("未找到 JMDict 数据文件 {}，词典查询将返回空结果。"
                                + "请先运行 scripts/download-jmdict.ps1 或配置 yuki.jmdict.xml。",
                        xml.toAbsolutePath());
            } else {
                log.info("首次启动：正在导入 JMDict（{}）…", xml.toAbsolutePath());
                long start = System.currentTimeMillis();
                try {
                    long rows = importService.importFromXml(xml);
                    repository.setMeta("imported_at", Instant.now().toString());
                    log.info("JMDict 导入完成：{} 行，耗时 {} 秒。", rows, (System.currentTimeMillis() - start) / 1000);
                } catch (Exception e) {
                    log.error("JMDict 导入失败：{}", e.getMessage());
                }
            }
        }

        String kokoroPath = environment.getProperty("yuki.kokoro.asset", "static/books/kokoro.json");
        try {
            boolean exists = getClass().getClassLoader().getResource(kokoroPath) != null;
            log.info(exists
                    ? "内置书资源校验通过：{}"
                    : "警告：未找到内置书资源 {}", kokoroPath);
        } catch (Exception e) {
            log.warn("内置书资源校验失败：{}", e.getMessage());
        }
    }
}
