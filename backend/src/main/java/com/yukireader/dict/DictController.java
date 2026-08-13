package com.yukireader.dict;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class DictController {

    private final JmdictRepository repository;

    public DictController(JmdictRepository repository) {
        this.repository = repository;
    }

    /** GET /api/dict?word=<词典原形>. 未命中返回空列表（规格 §4、§6）。 */
    @GetMapping("/dict")
    public List<DictEntry> dict(@RequestParam("word") String word) {
        String w = word == null ? "" : word.trim();
        if (w.isEmpty() || w.length() > 100) {
            return List.of();
        }
        return repository.findByWord(w);
    }
}
