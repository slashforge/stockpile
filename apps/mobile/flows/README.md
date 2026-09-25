# Argent flows

Replayable UI flows for the iOS dev client. They need Argent 0.25 or later and run with no LLM involved:

```bash
cd apps/mobile/flows
argent flow run browse-to-detail.yaml --device <UDID>
```

| Flow | Starts from | Ends on |
| --- | --- | --- |
| `browse-to-detail` | anywhere | AI Infrastructure detail (feed, then preview, then Bags, then detail) |
| `open-buy-sheet` | detail, signed in | buy sheet, amount step |
| `sign-in` | detail, signed out | buy sheet (sign-in continues into it) |
| `quote-and-close` | buy sheet | detail, after a live Jupiter quote. Never reviews or signs. |
| `sign-out` | detail | Account, signed out |
| `happy-path` | signed out | `browse-to-detail`, then `sign-in`, `quote-and-close` and `sign-out` in one file |

`happy-path.yaml` is these fragments joined together. Edit the fragments, then rebuild it.

## Secrets

`sign-in` types `{{secret:STOCKPILE_TEST_EMAIL}}` and `{{secret:STOCKPILE_TEST_CODE}}`. Put them in `~/.argent/secrets.env`, never in the repo. Run `argent secrets` to check they're picked up.

## Simulator keyboard caveat

Argent's `keyboard` tool sends hardware-key events. After it runs, iOS treats a hardware keyboard as attached and stops showing the software keyboard. This persists across app and Simulator restarts until the device is rebooted (`xcrun simctl shutdown <UDID> && xcrun simctl boot <UDID>`). Reboot before checking any layout that involves the keyboard.
