package com.yukireader.dict;

import java.util.List;

public record DictEntry(String surface, String reading, String pos, List<String> glosses) {
}
