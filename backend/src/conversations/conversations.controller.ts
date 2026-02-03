import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { ConversationsService } from "./conversations.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { UpdateConversationDto } from "./dto/update-conversation.dto";
import { TabulateConversationDto } from "./dto/tabulate-conversation.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma.service";
import { Response } from "express";
import PDFDocument from "pdfkit";
import { Readable } from "stream";

@Controller("conversations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.operator)
  create(@Body() createConversationDto: CreateConversationDto) {
    console.log(
      "📝 [POST /conversations] Criando conversa:",
      JSON.stringify(createConversationDto, null, 2)
    );
    return this.conversationsService.create(createConversationDto);
  }

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findAll(@Query() filters: any, @CurrentUser() user: any) {
    const where: any = { ...filters };

    // Aplicar filtros baseados no papel do usuário
    if (user.role === Role.operator) {
      // IMPORTANTE: Operador vê conversas apenas por userId (não por userLine)
      // Isso permite que as conversas continuem aparecendo mesmo se a linha foi banida
      where.userId = user.id; // Filtrar apenas conversas atribuídas a ele
    } else if (user.role === Role.supervisor && user.segment) {
      // Supervisor só vê conversas do seu segmento
      where.segment = user.segment;
    }
    // Admin e digital não têm filtro - veem todas as conversas

    return this.conversationsService.findAll(where);
  }

  @Get("active")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getActiveConversations(@CurrentUser() user: any) {
    console.log(
      `📋 [GET /conversations/active] Usuário: ${user.name} (${user.role}), line: ${user.line}, segment: ${user.segment}`
    );

    // Admin e digital veem TODAS as conversas ativas (sem filtro)
    if (user.role === Role.admin || user.role === Role.digital) {
      return this.conversationsService.findAll({ tabulation: null });
    }
    // Supervisor vê apenas conversas ativas do seu segmento
    if (user.role === Role.supervisor) {
      return this.conversationsService.findAll({
        segment: user.segment,
        tabulation: null,
      });
    }

    // OPERADOR: SEMPRE retorna apenas suas próprias conversas (filtradas por userId)
    // NUNCA retorna conversas de outros operadores, mesmo que estejam na mesma linha
    console.log(
      `📋 [GET /conversations/active] Operador ${user.name} - retornando APENAS suas conversas (userId: ${user.id})`
    );
    return this.conversationsService.findActiveConversations(
      undefined,
      user.id
    );
  }

  @Get("tabulated")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  async getTabulatedConversations(@CurrentUser() user: any) {
    console.log(
      `📋 [GET /conversations/tabulated] Usuário: ${user.name} (${user.role}), line: ${user.line}, segment: ${user.segment}`
    );

    // Admin e digital veem TODAS as conversas tabuladas (sem filtro)
    if (user.role === Role.admin || user.role === Role.digital) {
      return this.conversationsService.findAll({ tabulation: { not: null } });
    }
    // Supervisor vê apenas conversas tabuladas do seu segmento
    if (user.role === Role.supervisor) {
      return this.conversationsService.findAll({
        segment: user.segment,
        tabulation: { not: null },
      });
    }

    // OPERADOR: SEMPRE retorna apenas suas próprias conversas (filtradas por userId)
    // NUNCA retorna conversas de outros operadores, mesmo que estejam na mesma linha
    console.log(
      `📋 [GET /conversations/tabulated] Operador ${user.name} - retornando APENAS suas conversas (userId: ${user.id})`
    );
    return this.conversationsService.findTabulatedConversations(
      undefined,
      user.id
    );
  }

  @Get("segment/:segment")
  @Roles(Role.supervisor, Role.admin, Role.digital)
  getBySegment(
    @Param("segment") segment: string,
    @Query("tabulated") tabulated?: string
  ) {
    return this.conversationsService.getConversationsBySegment(
      +segment,
      tabulated === "true"
    );
  }

  @Get("contact/:phone")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  getByContactPhone(
    @Param("phone") phone: string,
    @Query("tabulated") tabulated?: string,
    @CurrentUser() user?: any
  ) {
    // Admin e Supervisor podem ver qualquer contato
    // Operador só pode ver contatos que tem conversas com ele (por userId, não por linha)
    // IMPORTANTE: Não filtrar por userLine para que conversas de linhas banidas continuem aparecendo
    if (user?.role === Role.operator) {
      return this.conversationsService.findByContactPhone(
        phone,
        tabulated === "true",
        user.id
      );
    }
    return this.conversationsService.findByContactPhone(
      phone,
      tabulated === "true"
    );
  }

  @Get(":id")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  findOne(@Param("id") id: string) {
    return this.conversationsService.findOne(+id);
  }

  @Patch(":id")
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  update(
    @Param("id") id: string,
    @Body() updateConversationDto: UpdateConversationDto
  ) {
    return this.conversationsService.update(+id, updateConversationDto);
  }

  @Post("tabulate/:phone")
  @Roles(Role.operator)
  tabulate(
    @Param("phone") phone: string,
    @Body() tabulateDto: TabulateConversationDto
  ) {
    return this.conversationsService.tabulateConversation(
      phone,
      tabulateDto.tabulationId
    );
  }

  @Post("recall/:phone")
  @Roles(Role.operator)
  async recallContact(@Param("phone") phone: string, @CurrentUser() user: any) {
    console.log(
      `📞 [POST /conversations/recall/:phone] Operador ${user.name} rechamando contato ${phone}`
    );

    // Buscar linha atual do operador (pode estar na tabela LineOperator ou no campo legacy)
    let userLine = user.line;

    // Se não tiver no campo legacy, buscar na tabela LineOperator
    if (!userLine) {
      const lineOperator = await this.prisma.lineOperator.findFirst({
        where: { userId: user.id },
        select: { lineId: true },
      });
      userLine = lineOperator?.lineId || null;
    }

    return this.conversationsService.recallContact(phone, user.id, userLine);
  }

  @Delete(":id")
  @Roles(Role.admin, Role.supervisor)
  remove(@Param("id") id: string) {
    return this.conversationsService.remove(+id);
  }

  @Get("download-pdf/:phone")
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: "Download conversa em PDF" })
  @ApiResponse({ status: 200, description: "PDF gerado com sucesso" })
  async downloadConversationPdf(
    @Param("phone") phone: string,
    @CurrentUser() user: any
  ): Promise<StreamableFile> {
    try {
      console.log(
        `📄 [GET /conversations/download-pdf/${phone}] Gerando PDF para conversa`
      );

      // Buscar conversa completa (admin, supervisor e digital podem baixar qualquer conversa)
      const conversation = await this.conversationsService.findByContactPhone(
        phone,
        false
      );

      console.log(
        `📄 Encontradas ${
          conversation?.length || 0
        } mensagens para o telefone ${phone}`
      );

      if (!conversation || conversation.length === 0) {
        throw new Error("Conversa não encontrada");
      }

      // Buscar informações do contato
      const contact = await this.prisma.contact.findUnique({
        where: { phone },
      });

      console.log(
        `📄 Iniciando geração do PDF com ${conversation.length} mensagens`
      );

      // Criar PDF em buffer
      const buffers: Buffer[] = [];
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      doc.on("data", (chunk) => buffers.push(chunk));

      console.log(`📄 Headers configurados, iniciando escrita do PDF`);

      // Título
      doc.fontSize(20).text("Conversa", { align: "center" });
      doc.moveDown();

      // Informações do contato
      doc.fontSize(12);
      doc.text(`Telefone: ${phone}`);
      if (contact) {
        doc.text(`Nome: ${contact.name || "Não informado"}`);
        doc.text(`CPF: ${contact.cpf || "Não informado"}`);
      }
      doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`);
      doc.moveDown();

      // Linha separadora
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Mensagens
      conversation.forEach((msg, index) => {
        const timestamp = new Date(msg.datetime).toLocaleString("pt-BR");
        const sender = msg.sender === "operator" ? "Operador" : "Cliente";
        const message = msg.message || "(mídia)";

        // Cabeçalho da mensagem
        doc
          .fontSize(10)
          .fillColor("gray")
          .text(`[${timestamp}] ${sender}:`, { continued: false });
        doc.fillColor("black");

        // Conteúdo da mensagem
        doc.fontSize(11).text(message, {
          width: 450,
          align: "left",
        });

        doc.moveDown(0.5);

        // Quebrar página se necessário
        if (doc.y > 700) {
          doc.addPage();
        }
      });

      // Finalizar PDF
      doc.end();

      // Aguardar o PDF ser gerado
      await new Promise((resolve) => {
        doc.on("end", resolve);
      });

      const pdfBuffer = Buffer.concat(buffers);

      console.log(`📄 PDF gerado com sucesso para conversa ${phone}`);

      // Retornar StreamableFile
      const stream = Readable.from(pdfBuffer);
      return new StreamableFile(stream, {
        type: "application/pdf",
        disposition: `attachment; filename=conversa-${phone}-${
          new Date().toISOString().split("T")[0]
        }.pdf`,
      });
    } catch (error) {
      console.error("❌ Erro ao gerar PDF:", error);
      throw error;
    }
  }
}
