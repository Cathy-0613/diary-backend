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
  const apiKey = process.env.BAIDU_ASR_API_KEY
  const secretKey = process.env.BAIDU_ASR_SECRET_KEY
  
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
// 语音识别接口（带超时和重试）
app.post('/api/extractAudioAndASR', async (req, res) => {
  const { audioBase64, format = 'wav', rate = 16000 } = req.body
  
  if (!audioBase64) {
    return res.status(400).json({ success: false, error: '缺少音频数据' })
  }
  
  // 检查音频大小（百度限制 60 秒，约 4.8MB PCM）
  const audioBuffer = Buffer.from(audioBase64, 'base64')
  const maxSize = 4.8 * 1024 * 1024 // 4.8MB
  if (audioBuffer.length > maxSize) {
    return res.status(400).json({ 
      success: false, 
      error: '音频过长，请控制在 60 秒内' 
    })
  }
  
  let retries = 2
  let lastError = null
  
  while (retries > 0) {
    try {
      const token = await getBaiduAsrToken()
      const len = audioBuffer.length
      
      const asrResponse = await axios.post('https://vop.baidu.com/server_api', {
        format: format,
        rate: rate,
        channel: 1,
        cuid: 'diary-app',
        token: token,
        speech: audioBase64,
        len: len
      }, {
        timeout: 30000, // 30秒超时
        headers: { 'Content-Type': 'application/json' }
      })
      
      const data = asrResponse.data
      console.log('百度识别结果:', data)
      
      if (data.err_no === 0) {
        const text = data.result ? data.result.join('') : ''
        return res.json({ success: true, text: text })
      } else if (data.err_no === 3305) {
        // 音频过长，特殊处理
        return res.status(400).json({ success: false, error: '音频过长，请控制在 60 秒内' })
      } else {
        throw new Error(`百度错误: ${data.err_msg} (${data.err_no})`)
      }
    } catch (err) {
      lastError = err
      console.error(`识别失败，剩余重试次数: ${retries - 1}`, err.message)
      retries--
      if (retries > 0) {
        // 等待 1 秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  
  res.status(500).json({ success: false, error: lastError?.message || '识别失败' })
})

app.get('/api/getPublicDiaries', async (req, res) => {
  const { page = 1, size = 10, sort = 'latest' } = req.query
  const currentOpenId = req.headers['x-openid'] || null
  
  const from = (parseInt(page) - 1) * parseInt(size)
  const to = from + parseInt(size) - 1
  
  try {
    let query = supabase
      .from('diaries')
      .select('*', { count: 'exact' })
      .eq('is_public', true)
      .range(from, to)
    
    if (sort === 'mostLiked') {
      query = query.order('like_count', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }
    
    const { data, error, count } = await query
    
    if (error) throw error
    
    let likedMap = {}
    if (currentOpenId && data.length > 0) {
      const diaryIds = data.map(d => d.id)
      const { data: likes } = await supabase
        .from('likes')
        .select('diary_id')
        .eq('open_id', currentOpenId)
        .in('diary_id', diaryIds)
      
      if (likes) {
        likes.forEach(like => { likedMap[like.diary_id] = true })
      }
    }
    
    // 获取所有用户信息（单独查询）
    const openIds = [...new Set(data.map(item => item.open_id))]
    let userMap = {}
    if (openIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('open_id, nick_name, avatar_url')
        .in('open_id', openIds)
      
      if (users) {
        users.forEach(user => {
          userMap[user.open_id] = user
        })
      }
    }
    
    const comments = data.map(item => ({
      id: item.id,
      content: item.content,
      like_count: item.like_count || 0,
      created_at: item.created_at,
      open_id: item.open_id,
      isMine: item.open_id === currentOpenId,
      user: {
        nickName: userMap[item.open_id]?.nick_name || '用户',
        avatarUrl: userMap[item.open_id]?.avatar_url || ''
      }
    }))
    
    res.json({ success: true, list, total: count, page: parseInt(page), size: parseInt(size) })
  } catch (err) {
    console.error('获取公开日记失败:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 2. 关注用户
 * POST /api/followUser
 */
app.post('/api/followUser', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { targetOpenId } = req.body
  
  if (!currentOpenId) {
    return res.status(401).json({ success: false, error: '未登录' })
  }
  if (!targetOpenId) {
    return res.status(400).json({ success: false, error: '缺少目标用户ID' })
  }
  if (currentOpenId === targetOpenId) {
    return res.status(400).json({ success: false, error: '不能关注自己' })
  }
  
  try {
    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_open_id', currentOpenId)
      .eq('following_open_id', targetOpenId)
      .single()
    
    if (existing) {
      return res.json({ success: false, error: '已经关注过了' })
    }
    
    const { error } = await supabase
      .from('follows')
      .insert([{
        follower_open_id: currentOpenId,
        following_open_id: targetOpenId,
        created_at: new Date()
      }])
    
    if (error) throw error
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 3. 取消关注
 * POST /api/unfollowUser
 */
app.post('/api/unfollowUser', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { targetOpenId } = req.body
  
  if (!currentOpenId) {
    return res.status(401).json({ success: false, error: '未登录' })
  }
  if (!targetOpenId) {
    return res.status(400).json({ success: false, error: '缺少目标用户ID' })
  }
  
  try {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_open_id', currentOpenId)
      .eq('following_open_id', targetOpenId)
    
    if (error) throw error
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 4. 获取关注/粉丝列表
 * GET /api/getFollowList?targetOpenId=xxx&type=following&page=1&size=20
 */
app.get('/api/getFollowList', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { targetOpenId, type = 'following', page = 1, size = 20 } = req.query
  
  const userId = targetOpenId || currentOpenId
  const from = (parseInt(page) - 1) * parseInt(size)
  const to = from + parseInt(size) - 1
  
  try {
    let query
    if (type === 'following') {
      query = supabase
        .from('follows')
        .select(`
          following_open_id,
          users:following_open_id (nick_name, avatar_url, bio)
        `)
        .eq('follower_open_id', userId)
        .range(from, to)
    } else {
      query = supabase
        .from('follows')
        .select(`
          follower_open_id,
          users:follower_open_id (nick_name, avatar_url, bio)
        `)
        .eq('following_open_id', userId)
        .range(from, to)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    const list = data.map(item => {
      const userData = type === 'following' ? item.users : item.users
      return {
        openId: type === 'following' ? item.following_open_id : item.follower_open_id,
        nickName: userData?.nick_name || '匿名用户',
        avatarUrl: userData?.avatar_url || '',
        bio: userData?.bio || ''
      }
    })
    
    res.json({ success: true, list, page: parseInt(page), size: parseInt(size) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 5. 点赞/取消点赞
 * POST /api/updateLike
 */
app.post('/api/updateLike', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { diaryId, action } = req.body
  
  if (!currentOpenId) {
    return res.status(401).json({ success: false, error: '未登录' })
  }
  if (!diaryId) {
    return res.status(400).json({ success: false, error: '缺少日记ID' })
  }
  
  try {
    if (action === 'like') {
      const { data: existing } = await supabase
        .from('likes')
        .select('id')
        .eq('open_id', currentOpenId)
        .eq('diary_id', diaryId)
        .single()
      
      if (!existing) {
        await supabase
          .from('likes')
          .insert([{
            open_id: currentOpenId,
            diary_id: diaryId,
            created_at: new Date()
          }])
        
        await supabase.rpc('increment_like_count', { diary_id_param: diaryId })
      }
    } else {
      await supabase
        .from('likes')
        .delete()
        .eq('open_id', currentOpenId)
        .eq('diary_id', diaryId)
      
      await supabase.rpc('decrement_like_count', { diary_id_param: diaryId })
    }
    
    const { data: diary } = await supabase
      .from('diaries')
      .select('like_count')
      .eq('id', diaryId)
      .single()
    
    res.json({ success: true, likeCount: diary?.like_count || 0 })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 6. 发表评论
 * POST /api/addComment
 */
app.post('/api/addComment', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { diaryId, content } = req.body
  
  if (!currentOpenId) {
    return res.status(401).json({ success: false, error: '未登录' })
  }
  if (!diaryId || !content) {
    return res.status(400).json({ success: false, error: '缺少必要参数' })
  }
  if (content.length > 500) {
    return res.status(400).json({ success: false, error: '评论内容不能超过500字' })
  }
  
  try {
    const { data, error } = await supabase
      .from('comments')
      .insert([{
        open_id: currentOpenId,
        diary_id: diaryId,
        content: content,
        created_at: new Date()
      }])
      .select()
      .single()
    
    if (error) throw error
    
    await supabase.rpc('increment_comment_count', { diary_id_param: diaryId })
    
    res.json({ success: true, commentId: data.id })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 7. 获取评论列表
 * GET /api/getComments?diaryId=xxx&page=1&size=20
 */
app.get('/api/getComments', async (req, res) => {
  const { diaryId, page = 1, size, pageSize } = req.query
  const limit = parseInt(size || pageSize || 20)
  
  if (!diaryId) {
    return res.status(400).json({ success: false, error: '缺少日记ID' })
  }
  
  const from = (parseInt(page) - 1) * parseInt(size)
  const to = from + parseInt(size) - 1
  
  try {
    const { data, error, count } = await supabase
      .from('comments')
      .select('*', { count: 'exact' })
      .eq('diary_id', diaryId)
      .order('created_at', { ascending: false })
      .range(from, to)
    
    if (error) throw error
    
    const comments = data.map(item => ({
      id: item.id,
      content: item.content,
      like_count: item.like_count || 0,
      created_at: item.created_at,
      user: {
        nickName: item.users?.nick_name || '匿名用户',
        avatarUrl: item.users?.avatar_url || ''
      }
    }))
    
    res.json({ success: true, comments, total: count, page: parseInt(page), size: parseInt(size) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * 8. 删除评论
 * DELETE /api/deleteComment
 */
app.delete('/api/deleteComment', async (req, res) => {
  const currentOpenId = req.headers['x-openid']
  const { commentId, diaryId } = req.body
  
  if (!currentOpenId) {
    return res.status(401).json({ success: false, error: '未登录' })
  }
  if (!commentId || !diaryId) {
    return res.status(400).json({ success: false, error: '缺少必要参数' })
  }
  
  try {
    const { data: comment, error: findError } = await supabase
      .from('comments')
      .select('open_id')
      .eq('id', commentId)
      .single()
    
    if (findError || !comment) {
      return res.status(404).json({ success: false, error: '评论不存在' })
    }
    
    if (comment.open_id !== currentOpenId) {
      return res.status(403).json({ success: false, error: '只能删除自己的评论' })
    }
    
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
    
    if (error) throw error
    
    await supabase.rpc('decrement_comment_count', { diary_id_param: diaryId })
    
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/getUserStats', async (req, res) => {
  const openId = req.headers['x-openid'] || 'test-user-001'
  
  // 获取日记总数
  const { count: diaryTotal } = await supabase
    .from('diaries')
    .select('*', { count: 'exact', head: true })
    .eq('open_id', openId)
  
  // 获取关注数
  const { count: followCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_open_id', openId)
  
  // 获取粉丝数
  const { count: fanCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_open_id', openId)
  
  res.json({
    success: true,
    diaryTotal: diaryTotal || 0,
    totalDuration: 0,  // 需要计算视频总时长
    streakDays: 0,     // 需要计算连续天数
    followCount: followCount || 0,
    fanCount: fanCount || 0
  })
})

// 翻译接口
app.post('/api/translateSubtitle', async (req, res) => {
  const { text, targetLang = 'zh' } = req.body
  
  if (!text) {
    return res.status(400).json({ success: false, error: '缺少翻译文本' })
  }
  
  try {
    const translatedText = await baiduTranslate(text, targetLang)
    res.json({ success: true, translatedText })
  } catch (err) {
    console.error('翻译失败:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(3000, () => {
  console.log('后端运行在 diary-backend-production-05aa.up.railway.app')
})