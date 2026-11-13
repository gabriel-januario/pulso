import type { ConfigApi } from '../config';
import type { Filters } from '../filters';
import type { Pulso } from '../usePulso';

export interface ViewProps { pulso: Pulso; filters: Filters; config: ConfigApi }
