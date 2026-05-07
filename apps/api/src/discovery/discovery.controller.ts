import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CreateDiscoveryJobDto,
  DiscoveryJobIdParamDto,
  ListDiscoveryJobsQueryDto
} from './discovery.dto';
import { DiscoveryService } from './discovery.service';

@Controller('discovery/jobs')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Post()
  async createJob(@Body() dto: CreateDiscoveryJobDto): Promise<{ jobId: string }> {
    return this.discoveryService.queueDiscovery(dto.icpId, dto.source);
  }

  @Get()
  async listJobs(@Query() query: ListDiscoveryJobsQueryDto) {
    return this.discoveryService.listJobs(query);
  }

  @Get(':id')
  async getJobById(@Param() params: DiscoveryJobIdParamDto) {
    return this.discoveryService.getJobById(params.id);
  }
}
