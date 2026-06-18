# Security notes

The updater fetches only URLs explicitly listed in `config/pipeline.yml`. It does not execute remote code or parse credentials. Keep the workflow permissions narrow and avoid adding secrets unless you add private data sources.

If you add new scripts or third-party actions, review their permissions before merging.
