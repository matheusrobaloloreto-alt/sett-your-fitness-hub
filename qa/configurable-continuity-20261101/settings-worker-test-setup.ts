import { configure } from '@testing-library/react';
// Shared macOS host is running concurrent independent QA workers. Preserve all
// assertions; allow lazy UI imports/DOM readback to finish under scheduler load.
configure({ asyncUtilTimeout: 10000 });
