import {ToolboxClient} from '../src/toolbox_core/client';

const client = new ToolboxClient('http://127.0.0.1:5000');

describe('loadTool', () => {
  test('Should load a tool', async () => {
    const tool = await client.loadTool("search-hotels-by-name")
    const toolResp = await tool({name: "Basel"})
    // expect(toolResp).toEqual("Hotel Basel Basel");
    const respStr = JSON.stringify(toolResp)
    expect(respStr).toMatch("Holiday Inn Basel")
})});
