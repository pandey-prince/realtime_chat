export class RoomNotFoundError extends Error {
  constructor(message = "Room does not exist") {
    super(message);
    this.name = "RoomNotFoundError";
  }
}

export class RateLimitError extends Error {
  retryAfter?: number;

  constructor(retryAfter?: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}
