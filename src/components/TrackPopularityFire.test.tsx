import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrackPopularityFire } from "./TrackPopularityFire";

describe("TrackPopularityFire", () => {
  it("labels evidence-backed top-three ranks", () => {
    render(<TrackPopularityFire rank={2} />);
    expect(
      screen.getByLabelText(
        "#2 most popular track on this album according to Last.fm",
      ),
    ).toBeInTheDocument();
  });

  it("does not render outside the top three", () => {
    const { container } = render(<TrackPopularityFire rank={4} />);
    expect(container).toBeEmptyDOMElement();
  });
});
