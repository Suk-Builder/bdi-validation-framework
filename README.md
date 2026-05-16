# BDI Validation Framework

> A cognitive profile validation system for the Builder-System domain. Implements structured assessment protocols to evaluate cognitive patterns across 6 dimensions: emotional rhythm, cognitive filtering, personality structure, attention system, dissociation spectrum, and achievement load.

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org/)
[![License](https://img.shields.io/badge/License-GPL%20v3-blue)](LICENSE)

## Overview

The **BDI (Builder Domain I) Validation Framework** provides structured protocols for cognitive posture assessment. It is the theoretical backbone of [psych-detect](https://github.com/Suk-Builder/psych-detect), translating cognitive science literature into computable evaluation frameworks.

## Six Dimensions

| Dimension | Source Literature | Assessment Focus |
|-----------|------------------|------------------|
| **Emotional Rhythm** | Bipolar/Depression/Mania | Mood fluctuation patterns, duration, functional impairment |
| **Cognitive Filtering** | Meritocracy/Self-referential Entropy | Self-evaluation, internal friction, cognitive distortion |
| **Personality Structure** | NPD/BPD/Schizoid/Schizotypal | Interpersonal patterns, self-boundaries, empathy |
| **Attention System** | ADHD/Comorbidity | Attention allocation, executive function, multitasking |
| **Dissociation Spectrum** | Depersonalization | Reality testing, self-continuity, body ownership |
| **Achievement Load** | Meritocracy/Meritocracy Syndrome | Achievement drive, rest shame, self-worth binding |

## Protocol Versions

- **v2.5** (current): Refined scoring thresholds, added cross-dimension interaction analysis
- Each protocol version includes: dimension definitions, question templates, scoring matrices, and risk calibration

## Components

```
bdi-validation-framework/
├── setup_bdi.py           # Environment setup and dependency install
├── protocol_v2.5.txt      # Full assessment protocol specification
├── src/                   # Core validation engine
│   ├── scoring.py         # Score calculation and threshold logic
│   ├── dimensions.py      # Dimension definitions and mappings
│   └── cross_analysis.py  # Cross-dimension interaction analysis
├── public/                # Shared validation resources
└── deploy.sh              # Deployment script
```

## Scoring Model

Per-dimension 5-point Likert scale (0-4), aggregated into four risk tiers:

| Score Range | Tier | Recommendation |
|-------------|------|----------------|
| 0-8 | 🟢 Green | Self-observation sufficient |
| 9-16 | 🟡 Yellow | Consider psychological counseling |
| 17-24 | 🟠 Orange | Recommend psychiatric evaluation |
| 25-32 | 🔴 Red | Urgent professional help needed |

## Integration with psych-detect

This framework powers the cognitive posture analysis in [psych-detect](https://github.com/Suk-Builder/psych-detect). The BDI protocol is encoded as `questions.json` and processed by the FHIR-compliant assessment engine.

## Quick Start

```bash
git clone https://github.com/Suk-Builder/bdi-validation-framework.git
cd bdi-validation-framework
python3 setup_bdi.py
python3 src/scoring.py --input assessment_responses.json
```

## About

Part of the [Builder-System](https://github.com/Suk-Builder/Builder-System) knowledge framework. Built by Ying Momo.

## License

GPL v3
