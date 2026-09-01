# Third-Party Software

Field Runtime Core installs third-party packages through the exact-pinned
`pnpm-lock.yaml`; it does not vendor their source into this repository.

The current production dependency graph contains MIT, BSD-3-Clause, and ISC
licensed packages. Direct dependencies are:

| Package       | Version | License |
| ------------- | ------- | ------- |
| `ajv`         | 8.20.0  | MIT     |
| `ajv-formats` | 3.0.1   | MIT     |
| `pg`          | 8.23.0  | MIT     |
| `yaml`        | 2.9.0   | ISC     |

Transitive license metadata is checked by `pnpm release:check`. Each installed
package retains its own copyright and license files. A future bundled or signed
distribution must generate and include a complete SBOM and applicable notices.
