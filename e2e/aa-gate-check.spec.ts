import { expect, test } from "@playwright/test";

// Deliberately failing, and temporary. Pushed to main on its own to find
// out whether a commit that fails its checks is kept off the live site.
// It changes no application code. Removed in the next commit.
test("deliberate failure, to test the deployment gate", () => {
  expect("this commit").toBe("allowed onto the site");
});
