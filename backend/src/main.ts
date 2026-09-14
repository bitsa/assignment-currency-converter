import { bootstrap, reportBootstrapFailure } from './bootstrap';

bootstrap().catch((error: unknown) => reportBootstrapFailure(error));
