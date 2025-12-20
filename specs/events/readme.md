# FuelGuard specs folder

Files:
- openapi.yml         : OpenAPI scaffold for main endpoints
- erd.mmd             : Mermaid ER diagram
- sale_sequence.mmd   : Mermaid sequence diagram for sale flow
- events/*.json       : JSON schemas for event topics used by simulator & ingestion

How to use:
1. Copy files into `specs/` at repo root.
2. Use the OpenAPI file to generate client/server stubs or to document endpoints.
3. Use the event JSON schemas to validate simulated events before ingesting.
4. Use the mermaid files in VSCode Mermaid preview or on the mermaid live editor.
