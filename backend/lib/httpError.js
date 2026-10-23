/** Throw from a route to send a specific status and message. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
module.exports = { HttpError };
