import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { OpenAiClient } from '../integrations/openai.client';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, OpenAiClient],
  exports: [AnalysisService]
})
export class AnalysisModule {}
