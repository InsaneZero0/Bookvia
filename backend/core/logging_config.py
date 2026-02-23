"""
Structured logging configuration for production readiness.
"""
import logging
import sys
import json
from datetime import datetime, timezone
from typing import Any, Dict
from core.config import ENV, IS_PRODUCTION


class StructuredFormatter(logging.Formatter):
    """
    JSON structured logging formatter for production.
    Outputs logs in a format compatible with log aggregators like:
    - AWS CloudWatch
    - Google Cloud Logging
    - ELK Stack
    - Datadog
    """
    
    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "env": ENV
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields if present
        if hasattr(record, "extra_data"):
            log_data["data"] = record.extra_data
        
        # Add request context if available
        for attr in ["request_id", "user_id", "business_id", "ip_address"]:
            if hasattr(record, attr):
                log_data[attr] = getattr(record, attr)
        
        return json.dumps(log_data, ensure_ascii=False)


class DevelopmentFormatter(logging.Formatter):
    """
    Human-readable formatter for development.
    """
    
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        
        # Build message
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        level = f"{color}{record.levelname:8}{self.RESET}"
        location = f"{record.module}.{record.funcName}:{record.lineno}"
        message = record.getMessage()
        
        formatted = f"{timestamp} | {level} | {location:40} | {message}"
        
        # Add exception if present
        if record.exc_info:
            formatted += f"\n{self.formatException(record.exc_info)}"
        
        return formatted


def setup_logging():
    """
    Configure logging based on environment.
    
    Production:
    - JSON structured logs
    - INFO level minimum
    - Outputs to stdout for container logs
    
    Development:
    - Colored human-readable logs
    - DEBUG level
    """
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if not IS_PRODUCTION else logging.INFO)
    
    # Remove existing handlers
    root_logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    
    if IS_PRODUCTION:
        console_handler.setFormatter(StructuredFormatter())
        console_handler.setLevel(logging.INFO)
    else:
        console_handler.setFormatter(DevelopmentFormatter())
        console_handler.setLevel(logging.DEBUG)
    
    root_logger.addHandler(console_handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    
    return root_logger


class RequestLogger:
    """
    Helper class for request-scoped logging with context.
    """
    
    def __init__(self, logger: logging.Logger, request_id: str = None):
        self.logger = logger
        self.request_id = request_id
        self.context: Dict[str, Any] = {}
    
    def add_context(self, **kwargs):
        """Add context that will be included in all logs"""
        self.context.update(kwargs)
    
    def _log(self, level: int, message: str, **kwargs):
        extra = {
            "extra_data": {**self.context, **kwargs}
        }
        if self.request_id:
            extra["request_id"] = self.request_id
        
        self.logger.log(level, message, extra=extra)
    
    def debug(self, message: str, **kwargs):
        self._log(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs):
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        self._log(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self._log(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        self._log(logging.CRITICAL, message, **kwargs)


# Initialize logging on import
logger = setup_logging()


def get_logger(name: str) -> logging.Logger:
    """Get a named logger"""
    return logging.getLogger(name)
