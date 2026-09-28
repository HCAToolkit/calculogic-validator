#!/usr/bin/env node
import {
  buildValidatorReportSummaryUsageLines,
  runValidatorReportSummaryCli,
} from '../src/core/cli/validator-report-summary.logic.mjs';

const exitCode = await runValidatorReportSummaryCli({
  argv: process.argv.slice(2),
  usageLines: buildValidatorReportSummaryUsageLines({
    commandName: 'calculogic-validator-report-summarize',
  }),
});

process.exit(exitCode);
