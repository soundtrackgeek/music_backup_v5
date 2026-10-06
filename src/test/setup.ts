import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// waitFor/findBy* default to 1 s, which is too tight when the machine is busy.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);
