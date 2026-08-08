#!/usr/bin/env node

const [, , command = 'help'] = process.argv;

const commands: Record<string, string> = {
  init: 'Create a standalone-book or series project.',
  ingest: 'Import and fingerprint manuscript sources.',
  analyse: 'Propose chapters, scenes, characters and story-bible entries.',
  calibrate: 'Create narrator and character calibration passages.',
  plan: 'Build a reviewable performance plan.',
  generate: 'Generate narration segments or chapters.',
  review: 'Inspect narration and production quality findings.',
  assemble: 'Assemble approved takes into chapter audio.',
  master: 'Master and validate audiobook delivery files.',
  visualise: 'Build an illustrated visual treatment and shot plan.',
  render: 'Render an approved visual companion.',
  export: 'Create a reproducible delivery package.',
};

if (command === 'help' || !(command in commands)) {
  console.log('EVAVO Storyteller Studio CLI');
  console.log('');
  console.log('Usage: storyteller <command>');
  console.log('');

  for (const [name, description] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(12)} ${description}`);
  }

  process.exit(command === 'help' ? 0 : 1);
}

console.log(`${command}: command foundation created; implementation pending.`);
