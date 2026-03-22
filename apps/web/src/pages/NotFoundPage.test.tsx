// A tiny route test is enough here because the page is static and only needs to offer a clear recovery path.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { NotFoundPage } from "./NotFoundPage";

describe("NotFoundPage", () => {
  it("shows a recovery path back into the app", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /not in this arena/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back home/i })).toHaveAttribute(
      "href",
      "/"
    );
  });
});
