package com.yukireader.common;

import com.yukireader.chat.ChatServiceException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

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

    /** 访问不存在的路径（如 /robots.txt、扫描器探测路径）→ 404，而不是 500。 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", Map.of("code", "not_found", "message", "请求的路径不存在")));
    }

    /** 用错误的方法访问接口（如 GET /api/tokenize）→ 405，而不是 500。 */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> methodNotAllowed(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(Map.of("error", Map.of("code", "method_not_allowed", "message", "请求方法不允许")));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> generic(Exception e) {
        log.warn("未处理的服务器异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", Map.of("code", "internal", "message", "服务器内部错误")));
    }
}
