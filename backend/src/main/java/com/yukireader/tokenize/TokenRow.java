package com.yukireader.tokenize;

/**
 * One token of a tokenized sentence, in the same shape the frontend renderer
 * consumes (surface / reading / basic / pos / clickable).
 */
public record TokenRow(String surface, String reading, String basic, String pos, boolean clickable) {
}
