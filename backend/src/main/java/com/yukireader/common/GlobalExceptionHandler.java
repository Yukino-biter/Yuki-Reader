package com.yukireader.common;

import com.yukireader.chat.ChatServiceException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ChatServiceException.class)
    public ResponseEntity<Map<String, Object>> chatError(ChatServiceException e) {
        HttpStatus status = switch (e.code()) {
            case "invalid_key" -> HttpStatus.UNAUTHORIZED;
            case "rate_limited" -> HttpStatus.TOO_MANY_REQUESTS;
            case "timeout" -> HttpStatus.GATEWAY_TIMEOUT;
            case "bad_request" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.BAD_GATEWAY;
        };
        return ResponseEntity.status(status)
                .body(Map.of("error", Map.of("code", e.code(), "message", e.getMessage())));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadableBody(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("error", Map.of("code", "bad_request", "message", "请求体格式错误")));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> generic(Exception e) {
        log.warn("未处理的服务器异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", Map.of("code", "internal", "message", "服务器内部错误")));
    }
}
