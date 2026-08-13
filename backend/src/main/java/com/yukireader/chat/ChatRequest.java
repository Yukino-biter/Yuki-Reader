package com.yukireader.chat;

import java.util.List;

public record ChatRequest(String baseUrl, String model, String apiKey, List<ChatMessage> messages) {
}
