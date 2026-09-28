#!/usr/bin/env node
import { runValidatorReportExamplesCli } from '../src/core/cli/validator-report-examples.logic.mjs';

process.exit(runValidatorReportExamplesCli({ argv: process.argv.slice(2) }));
