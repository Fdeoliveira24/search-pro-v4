# Icon libraries of Search Pro V4

Local copies of the three icon fonts that custom result icons can use. The tour loads a library only when an icon needs it:
first from this folder, then from the CDN (the same order as Fuse.js). If both fail the result shows the built-in icon of its type,
never an empty box. The Control Panel (`dashboard/control-panel-v4.html`) uses these copies for its icon picker.

| Folder | Library | Version | License | Classes (examples) | CDN backup (checked with an integrity hash) |
|---|---|---|---|---|---|
| `fontawesome/` | Font Awesome Free | 6.7.2 | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT | `fas fa-home`, `far fa-heart`, `fab fa-youtube` | cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css |
| `bootstrap-icons/` | Bootstrap Icons | 1.13.2 | MIT (`LICENSE` in the folder) | `bi bi-house` | cdn.jsdelivr.net/npm/bootstrap-icons@1.13.2/font/bootstrap-icons.min.css |
| `ionicons/` | Ionicons (the font version 4) | 4.6.3 | MIT (`LICENSE` in the folder) | `ion-md-home`, `ion-ios-home`, `ion-logo-github` | cdn.jsdelivr.net/npm/ionicons@4.6.3/dist/css/ionicons.min.css |

Only the `.woff2` (and for the two newer sets also `.woff`) files are kept; the style sheets are the unchanged files of the packages,
so the integrity hashes in `search-v4.js` (block "Icon libraries", `_ICON_LIBRARIES`) match both the local and the CDN copy.

## Where each part is used
- `search-v4.js`: `_ICON_LIBRARIES` (class pattern, local path, CDN address, integrity hash, a probe class), `_ensureIconLibrary()`, `_loadIconLibrariesFor()`, `getTypeIcon()` and the nothing-found icon.
- `dashboard/js/fontawesome-icons.js` (Font Awesome names), `dashboard/js/icon-libraries.js` (Bootstrap Icons and Ionicons names), `dashboard/js/emoji-library.js` (Emoji 17): the lists of the icon picker.
- The three lists were read from the style sheets in this folder and checked by drawing every icon; see `_maintenance/audit/evidence/display-round2-2026-10-10/`.

## Updating a library
1. Download the new version (`npm pack bootstrap-icons@<version>` etc.) and copy the style sheet and font files into the folder, keeping the layout above.
2. Calculate the integrity hash of the CDN file: `curl -s <cdn address> | openssl dgst -sha384 -binary | openssl base64 -A` and put `sha384-<hash>` and the new CDN address in `_ICON_LIBRARIES`.
3. Regenerate the picker lists (`gen_icons.js` in the evidence folder) and run `zsh run-tests.sh display` and `zsh run-tests.sh icons` in `_maintenance/test-harness`.
4. Do not add an icon name by hand to a list: a name the font does not have draws an empty tile.
