import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalyzeJobDto, CandidateIdParamDto, JobIdParamDto } from './analysis.dto';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('candidates/:id')
  async analyzeCandidate(@Param() params: CandidateIdParamDto) {
    return this.analysisService.analyzeCandidate(params.id);
  }

  @Get('candidates/:id/latest')
  async getLatestCandidateAnalysis(@Param() params: CandidateIdParamDto) {
    return this.analysisService.getLatestAnalysis(params.id);
  }

  @Post('jobs/:id')
  async analyzeJob(@Param() params: JobIdParamDto, @Body() body: AnalyzeJobDto) {
    const limit = body.limit ?? 20;
    return this.analysisService.analyzeJobCandidates(params.id, limit);
  }
}
