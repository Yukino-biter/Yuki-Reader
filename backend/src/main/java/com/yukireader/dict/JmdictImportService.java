package com.yukireader.dict;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import javax.xml.transform.stream.StreamSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Streams JMdict_e.xml (UTF-8, official JMDict distribution) into SQLite.
 * One row per (surface form, sense); glosses of a sense are joined with a
 * control character so they can be split back on read.
 */
@Service
public class JmdictImportService {

    private static final Logger log = LoggerFactory.getLogger(JmdictImportService.class);
    private static final int BATCH_SIZE = 2000;

    private final JmdictRepository repository;

    public JmdictImportService(JmdictRepository repository) {
        this.repository = repository;
    }

    private record Sense(List<String> pos, List<String> glosses) {}

    public long importFromXml(Path xmlFile) throws Exception {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        // JMdict_e.xml uses DTD entities (e.g. &n;, &v5k;) declared in its
        // internal subset. External entities stay disabled for safety.
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, true);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        // The file contains ~200k entity references; raise the JDK security limit.
        factory.setProperty("jdk.xml.entityExpansionLimit", 5_000_000);

        long rowCount = 0;
        long batchCount = 0;
        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        try (InputStream in = Files.newInputStream(xmlFile)) {
            XMLStreamReader reader = factory.createXMLStreamReader(
                    new StreamSource(in, xmlFile.toUri().toString()));
            EntryAccumulator entry = new EntryAccumulator();
            StringBuilder text = new StringBuilder();
            String currentTag = null;

            while (reader.hasNext()) {
                int event = reader.next();
                switch (event) {
                    case XMLStreamConstants.START_ELEMENT -> {
                        currentTag = reader.getLocalName();
                        if (isTextTag(currentTag)) {
                            text.setLength(0);
                        }
                        switch (currentTag) {
                            case "k_ele" -> entry.startKanji();
                            case "r_ele" -> entry.startReading();
                            case "sense" -> entry.startSense();
                            default -> { /* text tags handled below */ }
                        }
                    }
                    case XMLStreamConstants.CHARACTERS, XMLStreamConstants.CDATA -> {
                        if (isTextTag(currentTag)) text.append(reader.getText());
                    }
                    case XMLStreamConstants.END_ELEMENT -> {
                        String tag = reader.getLocalName();
                        switch (tag) {
                            case "ent_seq" -> entry.seq = text.toString().trim();
                            case "keb" -> entry.kanji.add(text.toString().trim());
                            case "reb" -> entry.readings.add(text.toString().trim());
                            case "pos" -> entry.currentSensePos.add(text.toString().trim());
                            case "gloss" -> entry.currentSenseGlosses.add(text.toString().trim());
                            case "sense" -> entry.endSense();
                            case "entry" -> {
                                rowCount += entry.flush(batch);
                                if (batch.size() >= BATCH_SIZE) {
                                    repository.batchInsert(batch);
                                    batch.clear();
                                    batchCount++;
                                    if (batchCount % 100 == 0) {
                                        log.info("JMDict 导入进度：{} 行", rowCount);
                                    }
                                }
                            }
                            default -> { }
                        }
                        currentTag = null;
                    }
                    default -> { }
                }
            }
            if (!batch.isEmpty()) {
                repository.batchInsert(batch);
            }
        } catch (XMLStreamException e) {
            throw new IllegalStateException("JMDict XML 解析失败: " + e.getMessage(), e);
        }

        repository.createIndexes();
        repository.setMeta("license", "JMdict is licensed under CC BY-SA 4.0 (https://www.edrdg.org/jmdict/jmdict.html)");
        repository.setMeta("source", "https://www.edrdg.org/jmdict/");
        repository.setMeta("rows", String.valueOf(rowCount));
        return rowCount;
    }

    private static boolean isTextTag(String tag) {
        return "ent_seq".equals(tag) || "keb".equals(tag) || "reb".equals(tag)
                || "pos".equals(tag) || "gloss".equals(tag);
    }

    /** Per-entry mutable accumulator mirroring the JMDict entry structure we care about. */
    private static final class EntryAccumulator {
        String seq = "";
        List<String> kanji = new ArrayList<>();
        List<String> readings = new ArrayList<>();
        List<Sense> senses = new ArrayList<>();
        List<String> currentSensePos = new ArrayList<>();
        List<String> currentSenseGlosses = new ArrayList<>();
        boolean senseOpen = false;

        void startKanji() {
            // k_ele grouping not needed; keb values are collected globally.
        }

        void startReading() {
            // r_ele grouping not needed; reb values are collected globally.
        }

        void startSense() {
            currentSensePos = new ArrayList<>();
            currentSenseGlosses = new ArrayList<>();
            senseOpen = true;
        }

        void endSense() {
            senses.add(new Sense(List.copyOf(currentSensePos), List.copyOf(currentSenseGlosses)));
            currentSensePos = new ArrayList<>();
            currentSenseGlosses = new ArrayList<>();
            senseOpen = false;
        }

        /** Emit rows for this entry into the batch; returns number of rows emitted. */
        long flush(List<Object[]> batch) {
            List<String> surfaces = kanji.isEmpty() ? List.of() : kanji;
            if (surfaces.isEmpty() && !readings.isEmpty()) {
                surfaces = List.of(readings.get(0));
            }
            String reading = readings.isEmpty() ? "" : readings.get(0);
            String seqValue = seq;
            long emitted = 0;
            for (String surface : surfaces) {
                if (surface == null || surface.isEmpty()) continue;
                for (Sense sense : senses) {
                    if (sense.glosses().isEmpty()) continue;
                    String pos = String.join("、", sense.pos());
                    String glosses = String.join(JmdictRepository.GLOSS_SEPARATOR, sense.glosses());
                    batch.add(new Object[]{seqValue, surface, reading, pos, glosses});
                    emitted++;
                }
            }
            reset();
            return emitted;
        }

        void reset() {
            seq = "";
            kanji = new ArrayList<>();
            readings = new ArrayList<>();
            senses = new ArrayList<>();
            currentSensePos = new ArrayList<>();
            currentSenseGlosses = new ArrayList<>();
            senseOpen = false;
        }
    }
}
