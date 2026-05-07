import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateIcpProfileDto, IcpIdParamDto, ListIcpProfilesQueryDto, UpdateIcpProfileDto } from './icp.dto';
import { IcpService } from './icp.service';

@Controller('icp/profiles')
export class IcpController {
  constructor(private readonly icpService: IcpService) {}

  @Post()
  async create(@Body() dto: CreateIcpProfileDto) {
    return this.icpService.create(dto);
  }

  @Get()
  async list(@Query() query: ListIcpProfilesQueryDto) {
    return this.icpService.list(query);
  }

  @Get(':id')
  async getById(@Param() params: IcpIdParamDto) {
    return this.icpService.getById(params.id);
  }

  @Patch(':id')
  async update(@Param() params: IcpIdParamDto, @Body() dto: UpdateIcpProfileDto) {
    return this.icpService.update(params.id, dto);
  }

  @Delete(':id')
  async remove(@Param() params: IcpIdParamDto) {
    return this.icpService.remove(params.id);
  }
}
