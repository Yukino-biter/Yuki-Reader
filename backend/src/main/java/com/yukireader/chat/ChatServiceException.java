package com.yukireader.chat;

public class ChatServiceException extends RuntimeException {

    private final String code;

    public ChatServiceException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
