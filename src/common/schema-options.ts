import { SchemaOptions } from '@nestjs/mongoose';

/**
 * Opções usadas por todos os schemas.
 *
 * O app fala em `id`, `criadoEm` e `atualizadoEm`. O Mongo fala em
 * `_id`, `createdAt` e `updatedAt`. A tradução acontece aqui, uma vez,
 * em vez de espalhar `doc._id.toString()` por trinta lugares.
 */
export const opcoesSchema: SchemaOptions = {
  timestamps: { createdAt: 'criadoEm', updatedAt: 'atualizadoEm' },
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true },
};
