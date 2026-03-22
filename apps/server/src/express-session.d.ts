// This keeps the session user id typed anywhere Express touches the session object.
import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}
