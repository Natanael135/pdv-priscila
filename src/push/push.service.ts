import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notificacao, NotificacaoDocument } from '../notificacoes/notificacao.schema';
import { Dispositivo, DispositivoDocument } from './dispositivo.schema';

const ENVIO_EXPO = 'https://exp.host/--/api/v2/push/send';

/** A Expo aceita no máximo 100 mensagens por chamada. */
const LOTE = 100;

interface Recibo {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectModel(Dispositivo.name)
    private readonly dispositivos: Model<DispositivoDocument>,
    @InjectModel(Notificacao.name)
    private readonly notificacoes: Model<NotificacaoDocument>,
  ) {}

  /**
   * Registra o aparelho, ou renova o que já existe.
   *
   * Upsert e não insert: o mesmo aparelho reabre o app todo dia e
   * mandaria o mesmo token sempre. `ultimoUso` serve para saber depois
   * quais tokens estão parados há meses.
   */
  async registrar(dados: { token: string; plataforma?: string; nome?: string }) {
    await this.dispositivos
      .findOneAndUpdate(
        { token: dados.token },
        {
          $set: {
            plataforma: dados.plataforma ?? null,
            nome: dados.nome ?? null,
            ultimoUso: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();

    return { registrado: true };
  }

  async remover(token: string) {
    await this.dispositivos.deleteOne({ token }).exec();
    return { removido: true };
  }

  /**
   * Manda um aviso para todos os aparelhos cadastrados.
   *
   * Token que a Expo recusa como morto é apagado na hora. Sem isso a
   * lista só cresce, e cada envio ficaria mais lento por causa de
   * aparelhos que não existem mais.
   */
  async enviar(titulo: string, mensagem: string, dados?: Record<string, unknown>) {
    /**
     * Trava para rodar a API localmente sem incomodar ninguém.
     *
     * O banco é o mesmo em desenvolvimento e em produção, e os tokens
     * cadastrados são de celulares REAIS. Sem isto, um teste que cria
     * um pedido faz o telefone da loja apitar com um cliente fictício
     * — foi exatamente o que aconteceu.
     *
     * Fica desligada por padrão: no servidor a variável não existe, e
     * o push sai normalmente.
     */
    if (process.env.PUSH_DESATIVADO === '1') {
      this.logger.log(
        `Push desativado (PUSH_DESATIVADO=1) — não enviei: "${titulo}"`,
      );
      return { enviados: 0, removidos: 0 };
    }

    const aparelhos = await this.dispositivos.find().lean().exec();
    if (!aparelhos.length) return { enviados: 0, removidos: 0 };

    let enviados = 0;
    const mortos: string[] = [];

    for (let i = 0; i < aparelhos.length; i += LOTE) {
      const fatia = aparelhos.slice(i, i + LOTE);

      const mensagens = fatia.map((a) => ({
        to: a.token,
        title: titulo,
        body: mensagem,
        sound: 'default',
        channelId: 'avisos-pdv',
        data: dados ?? {},
      }));

      try {
        const resposta = await fetch(ENVIO_EXPO, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(mensagens),
        });

        if (!resposta.ok) {
          this.logger.warn(
            `Expo recusou o lote (HTTP ${resposta.status}): ${await resposta.text()}`,
          );
          continue;
        }

        const { data } = (await resposta.json()) as { data?: Recibo[] };

        (data ?? []).forEach((recibo, indice) => {
          if (recibo.status === 'ok') {
            enviados++;
            return;
          }

          // aparelho desinstalou o app ou revogou a permissão
          if (recibo.details?.error === 'DeviceNotRegistered') {
            mortos.push(fatia[indice].token);
            return;
          }

          this.logger.warn(
            `Falha ao avisar um aparelho: ${recibo.details?.error ?? recibo.message}`,
          );
        });
      } catch (erro) {
        // rede fora não pode derrubar a chamada inteira
        this.logger.warn(`Não consegui falar com a Expo: ${String(erro)}`);
      }
    }

    if (mortos.length) {
      await this.dispositivos.deleteMany({ token: { $in: mortos } }).exec();
    }

    return { enviados, removidos: mortos.length };
  }

  /**
   * Resume o que está pendente e avisa — uma notificação só.
   *
   * O aviso NÃO sai no momento em que o estoque cai, e isso é de
   * propósito. Um dia movimentado geraria uma cascata de push por
   * produto, e o movimento de estoque acontece dentro da transação da
   * venda: disparar dali mandaria aviso de venda que ainda pode ser
   * revertida. Aqui é fora de qualquer transação e olhando o estado
   * final.
   *
   * O campo `avisado` é o que impede repetir o mesmo aviso a cada
   * chamada — só entra no resumo o que ainda não foi avisado.
   */
  async enviarResumoPendente() {
    const pendentes = await this.notificacoes
      .find({ lida: false, avisado: false })
      .lean()
      .exec();

    if (!pendentes.length) return { enviados: 0, removidos: 0, avisos: 0 };

    /**
     * Cobrança de hoje vai individual, com o nome do cliente.
     *
     * É acionável na hora — a pessoa lê "hoje é dia de receber da
     * Maria" e sabe o que fazer sem abrir nada. Diluir isso num "3
     * avisos pendentes" jogaria fora justamente a informação que faz o
     * aviso valer. Os outros tipos continuam somados: estoque baixo é
     * estado, não recado, e não melhora sendo repetido item a item.
     */
    const deHoje = pendentes.filter((n) => n.tipo === 'fiado_cobrar_hoje');
    const resto = pendentes.filter((n) => n.tipo !== 'fiado_cobrar_hoje');

    let enviados = 0;
    let removidos = 0;

    // teto para o caso raro de muitos vencendo no mesmo dia: acima
    // disso o celular viraria uma sequência de apitos
    const INDIVIDUAIS = 5;

    for (const aviso of deHoje.slice(0, INDIVIDUAIS)) {
      const r = await this.enviar(aviso.titulo, aviso.mensagem, {
        tela: 'ClienteDetalhe',
        id: aviso.cliente ? String(aviso.cliente) : undefined,
      });
      enviados += r.enviados;
      removidos += r.removidos;
    }

    const excedentes = Math.max(0, deHoje.length - INDIVIDUAIS);

    const estoque = resto.filter(
      (n) => n.tipo === 'estoque_baixo' || n.tipo === 'sem_estoque',
    ).length;
    const fiado = resto.filter((n) => n.tipo === 'fiado_vencido').length;

    const partes: string[] = [];
    if (estoque > 0) {
      partes.push(
        `${estoque} produto${estoque > 1 ? 's' : ''} precisando de reposição`,
      );
    }
    if (fiado > 0) {
      partes.push(
        `${fiado} cobrança${fiado > 1 ? 's' : ''} vencida${fiado > 1 ? 's' : ''}`,
      );
    }

    if (excedentes > 0) {
      partes.push(
        `mais ${excedentes} cobrança${excedentes > 1 ? 's' : ''} para hoje`,
      );
    }

    if (partes.length) {
      const resumo = await this.enviar(
        'Tem coisa para olhar',
        partes.join(' e ') + '.',
        { tela: 'Notificacoes' },
      );
      enviados += resumo.enviados;
      removidos += resumo.removidos;
    }

    const resultado = { enviados, removidos };

    /**
     * Marca só depois de enviar. Se a Expo estiver fora do ar, os
     * avisos continuam pendentes e entram no próximo disparo — melhor
     * repetir do que perder.
     */
    if (resultado.enviados > 0) {
      await this.notificacoes
        .updateMany(
          { _id: { $in: pendentes.map((n) => n._id) } },
          { $set: { avisado: true } },
        )
        .exec();
    }

    return { ...resultado, avisos: pendentes.length };
  }
}
