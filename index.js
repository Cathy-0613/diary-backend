const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')  
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// 初始化 Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// 测试接口
app.get('/', (req, res) => {
  res.json({ message: '后端运行正常' })
})

// 登录接口
app.post('/api/login', (req, res) => {
  res.json({ success: true, token: 'temp-token-123', userInfo: { nickName: '测试用户', avatarUrl: '' } })
})

// 获取日记列表接口
app.get('/api/getDiaryList', async (req, res) => {
  const openId = req.headers['x-openid'] || 'test-user-001'
  
  const { data, error } = await supabase
    .from('diaries')
    .select('*')
    .eq('open_id', openId)
    .order('created_at', { ascending: false })
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
  
  res.json({ success: true, list: data })
})

app.listen(3000, () => {
  console.log('后端运行在 http://localhost:3000')
})

// 保存日记
app.post('/api/addDiary', async (req, res) => {
  const { 
    title, 
    video_url, 
    cover_url, 
    location, 
    weather, 
    diary_date, 
    subtitle_raw, 
    subtitle_translated, 
    is_public 
  } = req.body
  
  // 临时用固定 openId，后续换成真实用户
  const openId = req.headers['x-openid'] || 'test-user-001'
  
  const { data, error } = await supabase
    .from('diaries')
    .insert([{
      open_id: openId,
      title: title || '',
      video_url: video_url || '',
      cover_url: cover_url || '',
      location: location || '',
      weather: weather || '',
      diary_date: diary_date || new Date().toISOString().split('T')[0],
      subtitle_raw: subtitle_raw || '',
      subtitle_translated: subtitle_translated || '',
      is_public: is_public || false,
      like_count: 0
    }])
    .select()
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
  
  res.json({ success: true, data: data[0] })
})

// 获取单条日记详情
app.get('/api/getDiaryDetail', async (req, res) => {
  const { id } = req.query
  
  if (!id) {
    return res.status(400).json({ success: false, error: '缺少日记ID' })
  }
  
  const { data, error } = await supabase
    .from('diaries')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
  
  res.json({ success: true, data })
})

// 删除日记
app.delete('/api/deleteDiary', async (req, res) => {
  const { id } = req.body
  const openId = req.headers['x-openid'] || 'test-user-001'
  
  console.log('删除请求:', { id, openId })
  
  if (!id) {
    return res.status(400).json({ success: false, error: '缺少日记ID' })
  }
  
  // 先确认是本人的日记
  const { data: diary, error: findError } = await supabase
    .from('diaries')
    .select('open_id')
    .eq('id', id)
    .single()
  
  console.log('查询结果:', { diary, findError })
  
  if (findError || !diary) {
    return res.status(404).json({ success: false, error: '日记不存在' })
  }
  
  if (diary.open_id !== openId) {
    return res.status(403).json({ success: false, error: '无权限删除' })
  }
  
  const { error } = await supabase
    .from('diaries')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('删除失败:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
  
  res.json({ success: true })
})

// 用户注册/更新（通过微信 code 登录）
app.post('/api/registerOrUpdateUser', async (req, res) => {
  const { code, nickName, avatarUrl } = req.body
  
  if (!code) {
    return res.status(400).json({ success: false, error: '缺少登录code' })
  }
  
  try {
    // 调用微信接口获取 openId（需要配置 appid 和 secret）
    // 临时方案：先用一个固定的 openId 测试
    // 正式上线需要调用：https://api.weixin.qq.com/sns/jscode2session
    
    // 临时测试用 openId
    let openId = 'test-user-' + code.substring(0, 8)
    
    // 查询用户是否存在
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('open_id', openId)
      .single()
    
    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 表示没找到，其他错误才是真正的错误
      return res.status(500).json({ success: false, error: findError.message })
    }
    
    if (existingUser) {
      // 用户存在，更新信息
      const { data, error } = await supabase
        .from('users')
        .update({
          nick_name: nickName || existingUser.nick_name,
          avatar_url: avatarUrl || existingUser.avatar_url,
          updated_at: new Date()
        })
        .eq('open_id', openId)
        .select()
        .single()
      
      if (error) {
        return res.status(500).json({ success: false, error: error.message })
      }
      
      return res.json({ 
        success: true, 
        isNew: false, 
        user: data,
        token: 'token-' + openId
      })
    } else {
      // 新用户，创建
      const { data, error } = await supabase
        .from('users')
        .insert([{
          open_id: openId,
          nick_name: nickName || '新用户',
          avatar_url: avatarUrl || ''
        }])
        .select()
        .single()
      
      if (error) {
        return res.status(500).json({ success: false, error: error.message })
      }
      
      return res.json({ 
        success: true, 
        isNew: true, 
        user: data,
        token: 'token-' + openId
      })
    }
  } catch (err) {
    console.error('注册失败:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// 读取环境变量
//const BAIDU_ASR_API_KEY = process.env.BAIDU_ASR_API_KEY
//const BAIDU_ASR_SECRET_KEY = process.env.BAIDU_ASR_SECRET_KEY
const BAIDU_TRANSLATE_APP_ID = process.env.BAIDU_TRANSLATE_APP_ID
const BAIDU_TRANSLATE_SECRET_KEY = process.env.BAIDU_TRANSLATE_SECRET_KEY

// 语音识别获取 token
async function getBaiduAsrToken() {
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_ASR_API_KEY}&client_secret=${BAIDU_ASR_SECRET_KEY}`
  const response = await fetch(url)
  const data = await response.json()
  return data.access_token
}

// 翻译接口（百度翻译需要签名）
async function baiduTranslate(text, targetLang = 'zh') {
  const salt = Date.now()
  const sign = require('crypto')
    .createHash('md5')
    .update(BAIDU_TRANSLATE_APP_ID + text + salt + BAIDU_TRANSLATE_SECRET_KEY)
    .digest('hex')
  
  const url = `https://fanyi-api.baidu.com/api/trans/vip/translate?q=${encodeURIComponent(text)}&from=auto&to=${targetLang}&appid=${BAIDU_TRANSLATE_APP_ID}&salt=${salt}&sign=${sign}`
  
  const response = await fetch(url)
  const data = await response.json()
  
  if (data.trans_result) {
    return data.trans_result.map(r => r.dst).join('')
  } else {
    throw new Error('翻译失败: ' + JSON.stringify(data))
  }
}

// 语音识别 + 翻译 接口
app.post('/api/asrAndTranslate', async (req, res) => {
  const { audioBase64, targetLang = 'zh' } = req.body
  
  try {
    // 1. 语音识别
    const token = await getBaiduAsrToken()
    const asrResult = await callBaiduAsr(audioBase64, token)
    
    if (!asrResult.text) {
      return res.json({ success: true, text: '', translatedText: '' })
    }
    
    // 2. 翻译
    let translatedText = ''
    if (targetLang !== 'zh' && asrResult.text) {
      translatedText = await baiduTranslate(asrResult.text, targetLang)
    }
    
    res.json({
      success: true,
      text: asrResult.text,
      translatedText: translatedText || asrResult.text
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// 获取百度 access_token（优化版，带缓存）
let cachedToken = null
let tokenExpireTime = 0

async function getBaiduAsrToken() {
  // 临时硬编码（直接写死）
  const apiKey = 'tKgRTo21zEZSQDm3ZXgCaZQK'
  const secretKey = 'Uv9ZMvYueYV7poicqSfWx5olOdGM1Tak'
  
  // 如果 token 还有效（提前5分钟刷新）
  if (cachedToken && Date.now() < tokenExpireTime - 5 * 60 * 1000) {
    return cachedToken
  }
  
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  
  const response = await axios.get(url)
  const data = response.data
  
  if (data.access_token) {
    cachedToken = data.access_token
    tokenExpireTime = Date.now() + data.expires_in * 1000
    return cachedToken
  } else {
    throw new Error('获取token失败: ' + JSON.stringify(data))
  }
}

// 语音识别接口
app.post('/api/extractAudioAndASR', async (req, res) => {
  const { audioBase64, format = 'wav', rate = 16000 } = req.body
  
  if (!audioBase64) {
    return res.status(400).json({ success: false, error: '缺少音频数据' })
  }
  
  try {
    // 获取token
    const token = await getBaiduAsrToken()
    
    // 计算音频长度（字节）
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const len = audioBuffer.length
    
    // 调用百度语音识别
    const asrResponse = await axios.post('https://vop.baidu.com/server_api', {
    format: format,
    rate: rate,
    channel: 1,
    cuid: 'diary-app',
    token: token,
    speech: audioBase64,
    len: len
  })
  
  const data = asrResponse.data
    console.log('百度识别结果:', data)
    
    if (data.err_no === 0) {
      const text = data.result ? data.result.join('') : ''
      res.json({ success: true, text: text })
    } else {
      res.status(500).json({ success: false, error: `百度错误: ${data.err_msg}` })
    }
  } catch (err) {
    console.error('识别失败:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

