import { Controller, Get, Param, Query } from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { CandidateIdParamDto, ListCandidatesQueryDto } from './candidate.dto';

@Controller('candidates')
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  @Get()
  async list(@Query() query: ListCandidatesQueryDto) {
    return this.candidateService.list(query);
  }

  @Get(':id')
  async getById(@Param() params: CandidateIdParamDto) {
    return this.candidateService.getById(params.id);
  }
}
